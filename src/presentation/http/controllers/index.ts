/**
 * Controller Registry
 *
 * Central registry of all HTTP controllers.
 * Add new controllers here to have them auto-registered on server startup.
 */

import type { Controller } from '../Controller.ts';
import { HealthController } from './HealthController.ts';
import { WebhookController } from './WebhookController.ts';

/** Type for controller class constructor that can be resolved from DI */
export type ControllerClass = new (...args: any[]) => Controller;

/**
 * Registry of all controller classes.
 * Controllers are resolved from the DI container and their routes
 * are automatically registered on the HTTP server.
 */
export const CONTROLLERS: ControllerClass[] = [
  HealthController,
  WebhookController,
];

export { HealthController };
export { WebhookController };
