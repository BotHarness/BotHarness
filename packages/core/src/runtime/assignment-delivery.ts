export class AssignmentInboxAcceptanceUncertainError extends Error {
  constructor(cause: unknown) {
    super('Assignment Inbox acceptance is uncertain; inspect the native Session before retrying', {
      cause,
    });
    this.name = 'AssignmentInboxAcceptanceUncertainError';
  }
}
