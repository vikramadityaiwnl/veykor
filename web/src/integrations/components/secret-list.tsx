import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { SecretKind, SecretRow } from "../secret-rows.ts";
import { secretRowErrors } from "../secret-rows.ts";

interface Props {
  disabled: boolean;
  kind: SecretKind;
  onChange: (rows: Array<SecretRow>) => void;
  rows: Array<SecretRow>;
}

const fieldClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40";

function SecretList(props: Props) {
  const errors = secretRowErrors(props.kind, props.rows);
  const singular = props.kind === "headers" ? "header" : "variable";

  return (
    <div className="space-y-2">
      {props.rows.map((row) => (
        <div key={row.id} className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              aria-label={`${singular} name`}
              className={fieldClass}
              disabled={props.disabled}
              onChange={(event) =>
                props.onChange(
                  props.rows.map((entry) =>
                    entry.id === row.id
                      ? { ...entry, name: event.target.value }
                      : entry,
                  ),
                )
              }
              placeholder={props.kind === "headers" ? "X-Api-Key" : "API_KEY"}
              type="text"
              value={row.name}
            />

            <input
              aria-label={`${singular} value`}
              autoComplete="off"
              className={fieldClass}
              disabled={props.disabled}
              onChange={(event) =>
                props.onChange(
                  props.rows.map((entry) =>
                    entry.id === row.id
                      ? { ...entry, value: event.target.value }
                      : entry,
                  ),
                )
              }
              placeholder={
                row.savedName !== null && row.savedName === row.name.trim()
                  ? "Saved — leave blank to keep"
                  : "Value"
              }
              type="password"
              value={row.value}
            />

            <button
              aria-label={`Remove ${row.name.trim() === "" ? singular : row.name.trim()}`}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={props.disabled}
              onClick={() =>
                props.onChange(
                  props.rows.filter((entry) => entry.id !== row.id),
                )
              }
              type="button"
            >
              <XMarkIcon aria-hidden="true" className="size-4" />
            </button>
          </div>

          {errors.get(row.id) !== undefined && (
            <p className="text-xs font-light text-rose-400" role="alert">
              {errors.get(row.id)}
            </p>
          )}
        </div>
      ))}

      <button
        className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-sm font-light text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={props.disabled}
        onClick={() =>
          props.onChange([
            ...props.rows,
            {
              id: crypto.randomUUID(),
              name: "",
              value: "",
              savedName: null,
            },
          ])
        }
        type="button"
      >
        <PlusIcon aria-hidden="true" className="size-4" />
        {props.kind === "headers" ? "Add header" : "Add variable"}
      </button>
    </div>
  );
}

export default SecretList;
