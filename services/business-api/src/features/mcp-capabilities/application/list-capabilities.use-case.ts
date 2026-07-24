import type { ListCapabilitiesResponse } from "@faios/contracts";
import { CapabilityRegistry } from "../infrastructure/capability-registry.js";

export class ListCapabilitiesUseCase {
  public constructor(private readonly registry = new CapabilityRegistry()) {}

  public execute(): ListCapabilitiesResponse {
    return {
      capabilities: this.registry.listAvailableCapabilities(),
    };
  }
}
