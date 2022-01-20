export class ResultError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ResultError.prototype);
  }

  json() {
    return JSON.stringify({
      "status": this.code,
      "message": this.message
    })
  }
}
