import fp from 'fastify-plugin';
import sensible, { type FastifySensibleOptions } from '@fastify/sensible';

export default fp<FastifySensibleOptions>(async (fastify) => {
  fastify.register(sensible);
});
