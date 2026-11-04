import { PlusIcon } from "@heroicons/react/24/outline";
import type { SkillSummary } from "@veykor/shared";
import Badge from "../../components/badge/badge.tsx";
import EmptyState from "../../components/empty-state/empty-state.tsx";

interface Props {
  onAdd: () => void;
  onDelete: (skill: SkillSummary) => void;
  onEdit: (skill: SkillSummary) => void;
  onToggle: (skill: SkillSummary) => void;
  skills: Array<SkillSummary>;
}

function SkillList(props: Props) {
  if (props.skills.length === 0) {
    return (
      <div className="py-16">
        <EmptyState
          actionLabel="Add skill"
          description="Write your first skill to teach chats new tricks."
          framedIcon={false}
          iconSize={40}
          onAction={props.onAdd}
          title="No skills yet"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <button
          aria-label="Add skill"
          className="grid min-h-28 place-items-center rounded-2xl border border-dashed border-zinc-700 transition hover:bg-zinc-900"
          onClick={props.onAdd}
          type="button"
        >
          <EmptyState
            icon={
              <PlusIcon aria-hidden="true" className="size-5 text-zinc-500" />
            }
            title="Add skill"
          />
        </button>

        {props.skills.map((skill) => (
          <div
            key={skill.id}
            className="cursor-pointer space-y-3 rounded-2xl border border-zinc-800 p-4 transition hover:border-zinc-700"
            onClick={() => props.onEdit(skill)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                props.onEdit(skill);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <h2 className="truncate font-semibold">{skill.name}</h2>

            <div className="flex items-center gap-2">
              <Badge
                text={skill.enabled ? "Enabled" : "Disabled"}
                tone={skill.enabled ? "success" : "danger"}
              />
            </div>

            <div className="flex gap-4 text-xs">
              <button
                className={
                  skill.enabled
                    ? "text-zinc-500 hover:text-rose-400"
                    : "text-zinc-500 hover:text-emerald-400"
                }
                onClick={(event) => {
                  event.stopPropagation();
                  props.onToggle(skill);
                }}
              >
                {skill.enabled ? "Disable" : "Enable"}
              </button>

              <button
                className="text-zinc-500 hover:text-rose-400"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onDelete(skill);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SkillList;
