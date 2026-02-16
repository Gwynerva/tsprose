export class TSProseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TSProseError';
  }
}
