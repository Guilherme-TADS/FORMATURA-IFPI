import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ATTACHMENT_KINDS, DOCUMENT_ENTITY_TYPES, sniffMimeType } from "@/lib/uploads";
import { getUploadLimits } from "@/lib/settings";

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
      { error: "Apenas administradores podem enviar documentos." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const kindRaw = formData.get("kind");
  const descriptionRaw = formData.get("description");
  const entityTypeRaw = formData.get("entityType");
  const entityIdRaw = formData.get("entityId");

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

  const kind =
    typeof kindRaw === "string" &&
    (ATTACHMENT_KINDS as readonly string[]).includes(kindRaw)
      ? kindRaw
      : "documento";

  let entityType = "document";
  let entityId: string | null = null;
  if (
    typeof entityTypeRaw === "string" &&
    (DOCUMENT_ENTITY_TYPES as readonly string[]).includes(entityTypeRaw) &&
    typeof entityIdRaw === "string" &&
    entityIdRaw.length > 0
  ) {
    entityType = entityTypeRaw;
    entityId = entityIdRaw;
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const sniffedMime = sniffMimeType(buffer);

  if (!sniffedMime || !limits.allowedMimeTypes.includes(sniffedMime)) {
    return NextResponse.json(
      { error: "Tipo de arquivo não permitido. Envie uma imagem (JPG, PNG, WEBP) ou PDF." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const extension = sniffedMime.split("/")[1];
  const storagePath = `documentos/${randomUUID()}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("attachments")
    .upload(storagePath, buffer, { contentType: sniffedMime });

  if (uploadError) {
    return NextResponse.json(
      { error: "Não foi possível enviar o arquivo. Tente novamente." },
      { status: 502 },
    );
  }

  const description =
    typeof descriptionRaw === "string" && descriptionRaw.trim().length > 0
      ? descriptionRaw.trim()
      : null;

  const { data: attachment, error: insertError } = await admin
    .from("attachments")
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      kind,
      status: "UPLOADED",
      temp_storage_path: storagePath,
      file_name: file.name || `documento.${extension}`,
      mime_type: sniffedMime,
      file_size: file.size,
      description,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (insertError) {
    await admin.storage.from("attachments").remove([storagePath]);
    return NextResponse.json(
      { error: "Não foi possível registrar o documento." },
      { status: 500 },
    );
  }

  return NextResponse.json({ attachmentId: attachment.id });
}
