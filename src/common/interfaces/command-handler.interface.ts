export interface ICommandHandler<TCommand, TResult> {
  execute(command: TCommand): Promise<TResult>;
}
