import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

/** Node 22 fetch does not automatically follow the desktop's proxy environment. */
export function configureEnvironmentProxy(
  env: NodeJS.ProcessEnv = process.env,
) {
  const httpProxy = env.http_proxy ?? env.HTTP_PROXY;
  const httpsProxy = env.https_proxy ?? env.HTTPS_PROXY;
  if (!httpProxy && !httpsProxy) return undefined;
  try {
    const agent = new EnvHttpProxyAgent({
      httpProxy,
      httpsProxy,
      noProxy: env.no_proxy ?? env.NO_PROXY ?? "localhost,127.0.0.1,[::1]",
    });
    setGlobalDispatcher(agent);
    return agent;
  } catch {
    // Proxy URLs can include credentials; do not expose the original exception.
    throw new Error(
      "代理配置无效，请检查 HTTP_PROXY/HTTPS_PROXY（配置内容已隐藏）",
    );
  }
}
