import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

let _appId = "";
let _sdk: W3SSdk | null = null;
let _loginHandler: (err: unknown, result: unknown) => void = () => {};

export function getW3SSdk(appId: string): W3SSdk {
  if (!_sdk || _appId !== appId) {
    _sdk = new W3SSdk(
      { appSettings: { appId } },
      (err, result) => _loginHandler(err, result)
    );
    _appId = appId;
  }
  return _sdk;
}

export function setLoginHandler(h: (err: unknown, result: unknown) => void): void {
  _loginHandler = h;
}

const DEVICE_ID_TIMEOUT_MS = 10_000;

export async function fetchDeviceId(appId: string): Promise<string | null> {
  try {
    const sdk = getW3SSdk(appId);
    const id = await Promise.race([
      sdk.getDeviceId(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), DEVICE_ID_TIMEOUT_MS)
      ),
    ]);
    return id ?? null;
  } catch {
    return null;
  }
}
