import type { CommandStatus } from "@faios/contracts";

export const toPrismaCommandStatus = (status: CommandStatus) =>
  status.toUpperCase() as Uppercase<CommandStatus>;
