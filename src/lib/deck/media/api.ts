import { jsonResponse } from "../../api";
import type { MediaFailureCode } from "./failure";
export function mediaError(code:MediaFailureCode,error:string,status:number):Response {
  return jsonResponse({code,error},status);
}
