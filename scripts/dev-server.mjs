import { createServer } from "vite";

const server = await createServer({
  logLevel: "info",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  }
});

await server.listen();
server.printUrls();

const close = async () => {
  await server.close();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await new Promise(() => {});
