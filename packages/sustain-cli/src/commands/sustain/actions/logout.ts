import { getSustainContext } from "../helpers";

export function logoutAction(): void {
  getSustainContext().engine.logout();
  console.log("Market session cleared.");
}
