export const ACCESS_COOKIE = "gh_gate";
export const ACCESS_COOKIE_VALUE = "1";
export const ACCESS_CODE_DEFAULT = "fishenal";

export function expectedAccessCode() {
  return process.env.ACCESS_CODE?.trim() || ACCESS_CODE_DEFAULT;
}
