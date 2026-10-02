/**
 * Public surface for `@liveclass/shared-types`: generated protocol types +
 * runtime validators compiled from the same JSON Schema. This is the single
 * import point for TypeScript clients (sync-engine, VS Code extension, web).
 */
export * from "./generated/messages";
export {
  PROTOCOL_VERSION,
  ProtocolValidationError,
  isMessage,
  parseMessage,
} from "./validators";
