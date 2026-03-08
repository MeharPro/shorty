export function loadLocalEnv(): void;
export function handleApiRequest(
  req: unknown,
  res: unknown,
  options?: { send404?: boolean }
): Promise<boolean>;
