import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

/** Keep in sync with `PERIOD_REF_STATIC_PREFIX` in periodReferenceCatalog.ts */
export const PERIOD_REF_STATIC_PREFIX = "/period-ref";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

export interface PeriodReferenceStaticRoots {
  user: string;
  habs: string;
}

export function defaultPeriodReferenceStaticRoots(repoRoot = process.cwd()): PeriodReferenceStaticRoots {
  return {
    user: path.resolve(repoRoot, "docs/ref"),
    habs: path.resolve(repoRoot, "docs/research/period-reference/images")
  };
}

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Resolve a `/period-ref/{user|habs}/...` request to a file under the configured roots.
 * Returns null when the path is not a period-ref URL or fails path-safety checks.
 */
export function resolvePeriodReferenceStaticPath(
  requestUrl: string,
  roots: PeriodReferenceStaticRoots = defaultPeriodReferenceStaticRoots()
): string | null {
  const pathname = new URL(requestUrl, "http://period-ref.local").pathname;
  if (!pathname.startsWith(`${PERIOD_REF_STATIC_PREFIX}/`)) {
    return null;
  }

  const remainder = pathname.slice(PERIOD_REF_STATIC_PREFIX.length + 1);
  const slash = remainder.indexOf("/");
  if (slash <= 0) {
    return null;
  }

  const collection = remainder.slice(0, slash);
  if (collection !== "user" && collection !== "habs") {
    return null;
  }

  const relativeEncoded = remainder.slice(slash + 1);
  if (!relativeEncoded || relativeEncoded.includes("\\") || relativeEncoded.includes("\0")) {
    return null;
  }

  let relative: string;
  try {
    relative = decodeURIComponent(relativeEncoded);
  } catch {
    return null;
  }

  if (relative.includes("\0") || path.isAbsolute(relative)) {
    return null;
  }

  const root = roots[collection];
  const resolved = path.resolve(root, relative);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    return null;
  }

  return resolved;
}

export function createPeriodReferenceStaticMiddleware(
  roots: PeriodReferenceStaticRoots = defaultPeriodReferenceStaticRoots()
): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = req.url ?? "";
    if (!url.startsWith(PERIOD_REF_STATIC_PREFIX)) {
      next();
      return;
    }

    if ((req.method ?? "GET") !== "GET" && (req.method ?? "GET") !== "HEAD") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    const filePath = resolvePeriodReferenceStaticPath(url, roots);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypeFor(filePath));
    res.setHeader("Cache-Control", "no-cache");
    if ((req.method ?? "GET") === "HEAD") {
      res.end();
      return;
    }

    createReadStream(filePath).pipe(res);
  };
}

export function createPeriodReferenceStaticPlugin(
  roots: PeriodReferenceStaticRoots = defaultPeriodReferenceStaticRoots()
): Plugin {
  const middleware = createPeriodReferenceStaticMiddleware(roots);
  return {
    name: "buildo-period-reference-static",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}
