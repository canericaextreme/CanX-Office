/** Only fixed diagnostic codes leave the build endpoint; never raw errors. */
export const WORK_FAILURE_CODES = ['CANX_BACKEND_NOT_CONFIGURED','CANX_WORK_RPC_UNAVAILABLE','CANX_CLIENT_AUTHORIZATION_FAILED','CANX_WORK_GRANT_REQUIRED','CANX_CLAIMS_INVALID'] as const;
export function officeWorkFailureCode(error:unknown):string {
 return error instanceof Error && (WORK_FAILURE_CODES as readonly string[]).includes(error.message) ? error.message : 'CANX_WORK_UNCONFIRMED';
}
