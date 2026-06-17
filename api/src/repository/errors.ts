/** Dispatch-layer error carrying an HTTP status. Thrown by dispatch + schema
 *  validation; the invoke route maps it to `res.status(status).json({error})`. */
export class DispatchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'DispatchError';
  }
}
