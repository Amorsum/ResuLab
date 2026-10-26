import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { configureEnvironmentProxy } from "../src/network.js";

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
test("external fetch uses a configured proxy without resolving the external hostname", async () => {
  const proxy = createServer();
  let destination = "";
  proxy.on("connect", (request, socket) => {
    destination = request.url ?? "";
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    socket.once("data", () =>
      socket.end(
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 14\r\nConnection: close\r\n\r\n{"proxy":true}',
      ),
    );
  });
  const previous = getGlobalDispatcher();
  const url = await listen(proxy);
  const agent = configureEnvironmentProxy({
    HTTP_PROXY: url,
    HTTPS_PROXY: url,
    NO_PROXY: "",
  });
  try {
    const response = await fetch("http://not-a-real-host.invalid/probe", {
      signal: AbortSignal.timeout(3000),
    });
    assert.deepEqual(await response.json(), { proxy: true });
    assert.equal(destination, "not-a-real-host.invalid:80");
  } finally {
    setGlobalDispatcher(previous);
    await agent?.close();
    await close(proxy);
  }
});
test("local requests bypass the outbound proxy by default", async () => {
  const local = createServer((_request, response) => response.end("local"));
  const url = await listen(local);
  const previous = getGlobalDispatcher();
  // An unreachable proxy proves that this request takes the direct route.
  const agent = configureEnvironmentProxy({
    HTTP_PROXY: "http://127.0.0.1:1",
    HTTPS_PROXY: "http://127.0.0.1:1",
  });
  try {
    assert.equal(
      await (await fetch(url, { signal: AbortSignal.timeout(3000) })).text(),
      "local",
    );
  } finally {
    setGlobalDispatcher(previous);
    await agent?.close();
    await close(local);
  }
});
test("no proxy leaves the dispatcher unchanged; invalid proxy errors hide credentials", () => {
  const previous = getGlobalDispatcher();
  assert.equal(configureEnvironmentProxy({}), undefined);
  assert.equal(getGlobalDispatcher(), previous);
  assert.throws(
    () => configureEnvironmentProxy({ HTTPS_PROXY: "bad-secret-value" }),
    (error: unknown) =>
      error instanceof Error && !error.message.includes("bad-secret-value"),
  );
});
