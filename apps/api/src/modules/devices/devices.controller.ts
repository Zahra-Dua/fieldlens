import type { FastifyRequest, FastifyReply } from "fastify";
import { devicesService } from "./devices.service";
import { registerDeviceSchema } from "./devices.schemas";

export async function registerDeviceHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const input = registerDeviceSchema.parse(request.body);
  const device = await devicesService.register(request.user!.sub, input);

  return reply.status(201).send(device);
}
