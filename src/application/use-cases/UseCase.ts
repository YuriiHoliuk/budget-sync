/**
 * Base class for all use cases in the application layer.
 *
 * Provides a consistent interface contract for use case implementations.
 * Subclasses must be decorated with @injectable() for DI.
 *
 * @template TRequest - Input type for the use case (defaults to void for no-input use cases)
 * @template TResponse - Output type for the use case
 */
export abstract class UseCase<TRequest = void, TResponse = void> {
  abstract execute(request: TRequest): Promise<TResponse>;
}
