// src/app/orga/reviere/[id]/edit/RevierMapObjectsForm.tsx #2
import { type AppLanguage } from "@/lib/i18n";
import RevierMapObjectRowActions from "./RevierMapObjectRowActions";
import RevierMapObjectRowControls, {
  type RevierMapObjectStatus,
  type RevierMapObjectType,
} from "./RevierMapObjectRowControls";

export type RevierMapObjectFormRow = {
  id: string;
  type: RevierMapObjectType;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  status: RevierMapObjectStatus;
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        title: "Ground infrastructure",
        text:
          "Manage high seats, ladders, bait sites, salt licks, traps and other map objects for this ground.",
        empty:
          "No ground infrastructure has been created yet. Use the empty row below to add the first object.",
        typeCol: "Type",
        nameCol: "Name",
        latitudeCol: "Latitude",
        longitudeCol: "Longitude",
        statusCol: "Status",
        actionsCol: "Actions",
      }
    : {
        title: "Reviereinrichtungen",
        text:
          "Verwalte Hochsitze, Leitern, Kirrungen, Salzlecken, Fallen und sonstige Kartenobjekte für dieses Revier.",
        empty:
          "Für dieses Revier sind noch keine Einrichtungen angelegt. Nutze die leere Zeile unten, um die erste Einrichtung zu ergänzen.",
        typeCol: "Typ",
        nameCol: "Name",
        latitudeCol: "Breitengrad",
        longitudeCol: "Längengrad",
        statusCol: "Status",
        actionsCol: "Aktionen",
      };
}

export default function RevierMapObjectsForm({
  rows,
  createAction,
  updateAction,
  deleteAction,
  isDemo = false,
  language,
}: {
  rows: RevierMapObjectFormRow[];
  createAction: (formData: FormData) => void | Promise<void>;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  isDemo?: boolean;
  language: AppLanguage;
}) {
  const text = t(language);

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div>
        <h2 className="text-lg font-medium text-white">{text.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-white/65">{text.text}</p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/68">
          {text.empty}
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-[22px] border border-white/10 bg-white/[0.03]">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-left text-white/55">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-medium">
                {text.typeCol}
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">
                {text.nameCol}
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">
                {text.latitudeCol}
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">
                {text.longitudeCol}
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">
                {text.statusCol}
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                {text.actionsCol}
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const rowKey = row.id;

              return (
                <tr key={row.id} className="border-t border-white/8 align-middle">
                  <RevierMapObjectRowControls
                    rowKey={rowKey}
                    objectId={row.id}
                    initialName={row.name}
                    initialType={row.type}
                    initialDescription={row.description}
                    initialLatitude={row.latitude}
                    initialLongitude={row.longitude}
                    initialStatus={row.status}
                    saveAction={updateAction}
                    isDemo={isDemo}
                    language={language}
                  />

                  <RevierMapObjectRowActions
                    rowKey={rowKey}
                    objectId={row.id}
                    canRemove
                    deleteAction={deleteAction}
                    isDemo={isDemo}
                    language={language}
                  />
                </tr>
              );
            })}

            <tr className="border-t border-white/8 align-middle">
              <RevierMapObjectRowControls
                rowKey="new"
                saveAction={createAction}
                isDemo={isDemo}
                language={language}
              />

              <RevierMapObjectRowActions
                rowKey="new"
                canRemove={false}
                isDemo={isDemo}
                language={language}
              />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}