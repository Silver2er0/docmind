import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anonymous per-browser identity: the client sends a random UUID in `x-session-id`. */
export const Owner = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const id = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>().headers['x-session-id'];
  if (!id || !UUID.test(id)) throw new BadRequestException('Missing or invalid x-session-id header');
  return id.toLowerCase();
});
