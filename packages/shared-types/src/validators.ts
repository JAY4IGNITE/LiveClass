import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

import { messageSchema } from "./generated/schema";
import type { Message } from "./generated/messages";

/** Wire protocol version. Must match `ProtocolVersion` const in the schema. */
export const PROTOCOL_VERSION = "1.0" as const;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validateMessage = ajv.compile(
  messageSchema as unknown as object,
) as ValidateFunction<Message>;

/** Thrown by {@link parseMessage} when validation against the schema fails. */
export class ProtocolValidationError extends Error {
  readonly errors: unknown;
  constructor(errors: unknown) {
    super("Protocol validation failed");
    this.name = "ProtocolValidationError";
    this.errors = errors;
  }
}

/** Type guard: does `data` satisfy the wire protocol schema? */
export function isMessage(data: unknown): data is Message {
  return validateMessage(data) === true;
}

/** Validate and narrow `data` to a {@link Message}, or throw. */
export function parseMessage(data: unknown): Message {
  if (validateMessage(data)) {
    return data as Message;
  }
  throw new ProtocolValidationError(validateMessage.errors);
}
