export const log = (scope: string, ...a: any[]) => console.log(new Date().toISOString().slice(11, 19), `[${scope}]`, ...a);
