/** C 站内容访问偏好：按协议版本和确认时间校验本机授权，旧数据默认关闭。 */
export const CONTENT_AGREEMENT_VERSION = 1;
export interface CivitaiContentAccess {
  enabled: boolean;
  agreementVersion: number;
  acceptedAt: number | null;
}
export function resolveCivitaiContentAccess(value: unknown): CivitaiContentAccess {
  const saved = typeof value === "object" && value !== null ? value as Partial<CivitaiContentAccess> : {};
  const acceptedAt = saved.acceptedAt;
  const accepted = saved.agreementVersion === CONTENT_AGREEMENT_VERSION &&
    typeof acceptedAt === "number" && Number.isFinite(acceptedAt) && acceptedAt > 0;
  return {
    enabled: accepted && saved.enabled === true,
    agreementVersion: accepted ? CONTENT_AGREEMENT_VERSION : 0,
    acceptedAt: accepted ? acceptedAt : null,
  };
}
