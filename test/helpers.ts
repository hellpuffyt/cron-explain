/** Capture-everything Io for CLI tests. */
export function fakeIo(): {
  io: { stdout(t: string): void; stderr(t: string): void };
  out: () => string;
  err: () => string;
} {
  let out = "";
  let err = "";
  return {
    io: {
      stdout: (t) => {
        out += t;
      },
      stderr: (t) => {
        err += t;
      },
    },
    out: () => out,
    err: () => err,
  };
}
