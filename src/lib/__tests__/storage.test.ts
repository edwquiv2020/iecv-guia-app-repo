import { describe, expect, it, vi, beforeEach } from "vitest";

const upload = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: (...a: unknown[]) => upload(...a), remove: vi.fn() }) } }),
}));

const { subirArchivoGuia } = await import("@/lib/storage");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "http://x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
});

describe("subirArchivoGuia", () => {
  it("sube el archivo bajo tipo/guia/nombre y devuelve su ruta", async () => {
    upload.mockResolvedValue({ error: null });
    const r = await subirArchivoGuia("g1", "intermedio", "examen.docx", Buffer.from("hola").toString("base64"));
    expect(r.storagePath).toBe("intermedio/g1/examen.docx");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][2]).toMatchObject({ upsert: true });
  });

  it("reintenta si Storage falla de forma intermitente (error o excepción) y se recupera", async () => {
    upload.mockResolvedValueOnce({ error: { message: "fetch failed" } }).mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce({ error: null });
    const r = await subirArchivoGuia("g1", "intermedio", "examen.docx", "aG9sYQ==");
    expect(r.storagePath).toBe("intermedio/g1/examen.docx");
    expect(upload).toHaveBeenCalledTimes(3);
  });

  it("si falla las 3 veces lanza con el motivo", async () => {
    upload.mockResolvedValue({ error: { message: "quota" } });
    await expect(subirArchivoGuia("g1", "intermedio", "examen.docx", "aG9sYQ==")).rejects.toThrow(/examen\.docx a Storage: quota/);
    expect(upload).toHaveBeenCalledTimes(3);
  });
});
