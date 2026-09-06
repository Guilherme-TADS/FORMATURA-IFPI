import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sniffMimeType } from "@/lib/uploads";
import { getUploadLimits } from "@/lib/settings";
import { isDriveConfigured, getDriveService } from "@/lib/services/drive";

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export async function POST(request: Request) {
  const limits = await getUploadLimits();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (!profile?.active || profile.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas administradores podem enviar imagens de rifas." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo de imagem não enviado." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "O arquivo selecionado está vazio." }, { status: 400 });
  }

  if (file.size > limits.maxSizeBytes) {
    return NextResponse.json(
      {
        error: `A imagem é muito grande. O limite máximo é ${Math.round(limits.maxSizeBytes / 1024 / 1024)}MB.`,
      },
      { status: 400 },
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const sniffedMime = sniffMimeType(buffer);

  if (!sniffedMime || !ALLOWED_IMAGE_MIMES.includes(sniffedMime as (typeof ALLOWED_IMAGE_MIMES)[number])) {
    return NextResponse.json(
      { error: "Formato de arquivo inválido. Envie uma imagem JPG, PNG ou WebP." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Garante que o bucket raffle-images exista
  try {
    const { data: buckets } = await admin.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.id === "raffle-images" || b.name === "raffle-images");
    if (!bucketExists) {
      await admin.storage.createBucket("raffle-images", {
        public: true,
        allowedMimeTypes: [...ALLOWED_IMAGE_MIMES],
        fileSizeLimit: limits.maxSizeBytes,
      });
    }
  } catch (bucketErr) {
    console.warn("Aviso ao verificar ou criar bucket raffle-images:", bucketErr);
  }

  const extension = sniffedMime.split("/")[1] || "jpg";
  const storagePath = `${randomUUID()}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("raffle-images")
    .upload(storagePath, buffer, {
      contentType: sniffedMime,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Não foi possível armazenar a imagem. Tente novamente." },
      { status: 502 },
    );
  }

  const { data: publicUrlData } = admin.storage
    .from("raffle-images")
    .getPublicUrl(storagePath);

  const publicUrl = publicUrlData.publicUrl;

  // Registra no histórico de anexos para rastreabilidade
  try {
    await admin.from("attachments").insert({
      entity_type: "raffle",
      entity_id: null,
      kind: "imagem",
      status: "UPLOADED",
      temp_storage_path: storagePath,
      file_name: file.name || `imagem-rifa.${extension}`,
      mime_type: sniffedMime,
      file_size: file.size,
      uploaded_by: user.id,
    });
  } catch (err) {
    console.warn("Aviso ao registrar anexo no banco:", err);
  }

  // Se o Google Drive estiver configurado, envia uma cópia de segurança
  if (isDriveConfigured()) {
    try {
      const drive = getDriveService();
      const folderId =
        process.env.GOOGLE_DRIVE_RAFFLES_FOLDER_ID ||
        process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ||
        "";
      await drive.uploadFile({
        folderId,
        fileName: file.name || `rifa-${storagePath}`,
        mimeType: sniffedMime,
        data: buffer,
      });
    } catch (err) {
      console.warn("Aviso: Falha no backup da imagem da rifa para o Google Drive:", err);
    }
  }

  return NextResponse.json({
    url: publicUrl,
    fileName: file.name,
  });
}
