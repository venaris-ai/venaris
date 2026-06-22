// src/app/api/materialized-event-review/route.ts #1
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { assertNotDemoWrite, requireOrganizationRole } from "@/lib/auth";
import { getLanguageFromRequest, type AppLanguage } from "@/lib/i18n";

type ReviewPayload = {
  materializedEventId?: unknown;
  relevant?: unknown;
  species?: unknown;
  animalCount?: unknown;
};

function hasOwn(value: unknown, key: keyof ReviewPayload) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

async function isAllowedSpecies(
  supabase: ReturnType<typeof supabaseServer>,
  value: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("taxonomy_species_meta")
    .select("species")
    .eq("species", value)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to validate taxonomy species");
  }

  return Boolean(data);
}

function isValidAnimalCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 999
  );
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        activeOrganizationNotFound: "active organization not found",
        eventIdAndFieldsRequired:
          "materializedEventId, relevant, species and animalCount are required",
        relevantMustBeBooleanOrNull: "relevant must be boolean or null",
        speciesMustBeValid:
          "species must be null or a valid taxonomy species",
        animalCountMustBeValid:
          "animalCount must be null or an integer between 1 and 999",
        eventNotFound: "materialized event not found",
        notAllowed: "not allowed",
      }
    : {
        activeOrganizationNotFound: "aktive Organisation nicht gefunden",
        eventIdAndFieldsRequired:
          "materializedEventId, relevant, species und animalCount sind erforderlich",
        relevantMustBeBooleanOrNull: "relevant muss boolean oder null sein",
        speciesMustBeValid:
          "species muss null oder eine gültige taxonomy species sein",
        animalCountMustBeValid:
          "animalCount muss null oder eine ganze Zahl zwischen 1 und 999 sein",
        eventNotFound: "Materializer-Ereignis nicht gefunden",
        notAllowed: "nicht erlaubt",
      };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(req: NextRequest) {
  const language = getLanguageFromRequest(req);
  const text = t(language);

  try {
    const ctx = await requireOrganizationRole(["owner", "admin", "member"]);
    assertNotDemoWrite(ctx);

    const activeOrganization = ctx.activeMembership.organizations;

    if (!activeOrganization) {
      return NextResponse.json(
        { error: text.activeOrganizationNotFound },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    const body = (await req.json().catch(() => null)) as ReviewPayload | null;

    if (
      !body ||
      typeof body.materializedEventId !== "string" ||
      !hasOwn(body, "relevant") ||
      !hasOwn(body, "species") ||
      !hasOwn(body, "animalCount")
    ) {
      return NextResponse.json(
        { error: text.eventIdAndFieldsRequired },
        { status: 400 }
      );
    }

    const materializedEventId = body.materializedEventId;
    const relevant = body.relevant;
    const species = body.species;
    const animalCount = body.animalCount;

    if (relevant !== null && typeof relevant !== "boolean") {
      return NextResponse.json(
        { error: text.relevantMustBeBooleanOrNull },
        { status: 400 }
      );
    }

    if (species !== null && typeof species !== "string") {
      return NextResponse.json(
        { error: text.speciesMustBeValid },
        { status: 400 }
      );
    }

    if (species !== null) {
      const allowed = await isAllowedSpecies(supabase, species);

      if (!allowed) {
        return NextResponse.json(
          { error: text.speciesMustBeValid },
          { status: 400 }
        );
      }
    }

    if (animalCount !== null && !isValidAnimalCount(animalCount)) {
      return NextResponse.json(
        { error: text.animalCountMustBeValid },
        { status: 400 }
      );
    }

    const { data: materializedEvent, error: materializedEventError } =
      await supabase
        .from("materialized_events")
        .select("id,camera_id")
        .eq("id", materializedEventId)
        .maybeSingle();

    if (materializedEventError) {
      return NextResponse.json(
        { error: materializedEventError.message },
        { status: 500 }
      );
    }

    if (!materializedEvent) {
      return NextResponse.json({ error: text.eventNotFound }, { status: 404 });
    }

    const { data: camera, error: cameraError } = await supabase
      .from("cameras")
      .select("organization_id")
      .eq("id", materializedEvent.camera_id)
      .maybeSingle();

    if (cameraError) {
      return NextResponse.json({ error: cameraError.message }, { status: 500 });
    }

    if (!camera || camera.organization_id !== activeOrganization.id) {
      return NextResponse.json({ error: text.notAllowed }, { status: 403 });
    }

    const relevantUser = relevant as boolean | null;
    const speciesUser = relevantUser === false ? null : (species as string | null);
    const animalCountUser =
      relevantUser === false ? null : (animalCount as number | null);

    const { error: updateError } = await supabase
      .from("materialized_events")
      .update({
        event_relevant_user: relevantUser,
        event_species_user: speciesUser,
        event_animal_count_user: animalCountUser,
        updated_at: new Date().toISOString(),
      })
      .eq("id", materializedEventId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      materializedEventId,
      eventRelevantUser: relevantUser,
      eventSpeciesUser: speciesUser,
      eventAnimalCountUser: animalCountUser,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "materialized_event_review_api_crashed",
        details: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
