export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string = 'Failed to connect to database') {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class UniqueConstraintError extends DatabaseError {
  constructor(
    public readonly constraintName: string,
    message?: string,
  ) {
    super(message ?? `Unique constraint violated: ${constraintName}`);
    this.name = 'UniqueConstraintError';
  }
}

export class ForeignKeyConstraintError extends DatabaseError {
  constructor(
    public readonly constraintName: string,
    message?: string,
  ) {
    super(message ?? `Foreign key constraint violated: ${constraintName}`);
    this.name = 'ForeignKeyConstraintError';
  }
}
