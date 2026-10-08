import {describe,it,expect} from 'vitest';
import {officeWorkFailureCode,WORK_FAILURE_CODES} from './office-work-diagnostic';
describe('Build failure diagnostics',()=>{
 it('returns only known fixed stages',()=>{for(const code of WORK_FAILURE_CODES)expect(officeWorkFailureCode(Error(code))).toBe(code);});
 it('does not return raw errors or credential-shaped text',()=>{for(const value of [Error('Bearer private-token'),Error('internal database detail'),{message:'CANX_WORK_GRANT_REQUIRED'},null])expect(officeWorkFailureCode(value)).toBe('CANX_WORK_UNCONFIRMED');});
});