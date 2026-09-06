import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sniffMimeType } from "@/lib/uploads";
import { getUploadLimits } from "@/lib/settings";
import { isDriveConfigured, getDriveService } from "@/lib/services/drive";

export async function POST(request: Request) {
  const limits = await getUploadLimits();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const admin = createAdminClient();
  const { error: rateLimitError } = await admin.rpc("check_rate_limit", {
    p_bucket: "upload_comprovante",
    p_identifier: ip,
    p_max_events: 15,
    p_window_seconds: 60,
  });
  if (rateLimitError) {
    return NextResponse.json(
      { error: "Muitas tentativas em pouco tempo. Aguarde um instante." },
      { status: 429 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  }

  if (file.size > limits.maxSizeBytes) {
    return NextResponse.json(
      {
        error: `Arquivo muito grande. O limite é ${Math.round(limits.maxSizeBytes / 1024 / 1024)}MB.`,
      },
      { status: 400 },
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const sniffedMime = sniffMimeType(buffer);

  if (!sniffedMime || !limits.allowedMimeTypes.includes(sniffedMime)) {
    return NextResponse.json(
      { error: "Tipo de arquivo não permitido. Envie uma imagem (JPG, PNG, WEBP) ou PDF." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const extension = sniffedMime.split("/")[1];
  const storagePath = `raffle-sales/${randomUUID()}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("attachments")
    .upload(storagePath, buffer, { contentType: sniffedMime });

  if (uploadError) {
    return NextResponse.json(
      { error: "Não foi possível enviar o arquivo. Tente novamente." },
      { status: 502 },
    );
  }

  const fileHash = createHash("sha256").update(buffer).digest("hex");

  const basePayload = {
    entity_type: "raffle_sale",
    entity_id: null,
    kind: "comprovante",
    status: "UPLOADED" as const,
    temp_storage_path: storagePath,
    file_name: file.name || `comprovante.${extension}`,
    mime_type: sniffedMime,
    file_size: file.size,
    description: `sha256:${fileHash}`,
    uploaded_by: user?.id ?? null,
  };

  const { data: attachment, error: insertError } = await admin
    .from("attachments")
    .insert(basePayload)
    .select("id")
    .single();

  if (insertError || !attachment) {
    await admin.storage.from("attachments").remove([storagePath]);
    return NextResponse.json(
      { error: "Não foi possível registrar o comprovante." },
      { status: 500 },
    );
  }

  if (isDriveConfigured()) {
    try {
      const drive = getDriveService();
      const folderId =
        process.env.GOOGLE_DRIVE_RAFFLES_FOLDER_ID ||
        process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ||
        "";
      const driveFile = await drive.uploadFile({
        folderId,
        fileName: file.name || `comprovante.${extension}`,
        mimeType: sniffedMime,
        data: buffer,
      });
      await admin
        .from("attachments")
        .update({
          drive_file_id: driveFile.id,
          drive_url: driveFile.webViewLink,
        })
        .eq("id", attachment.id);
    } catch (err) {
      console.warn("Aviso: Sincronização do comprovante com o Google Drive falhou:", err);
    }
  }

  return NextResponse.json({ attachmentId: attachment.id });
}
