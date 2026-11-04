import { CheckIcon } from "@heroicons/react/24/outline";
import { useTeamStore } from "../team-store.ts";

interface Props {
  memberId: string;
  showMemberHeaders?: boolean;
}

function TeamTodos(props: Props) {
  const members = useTeamStore((state) => state.snapshot.members);
  const lists = members
    .filter((member) => member.todos.length > 0)
    .sort(
      (a, b) =>
        Number(b.id === props.memberId) - Number(a.id === props.memberId),
    );

  if (lists.length === 0) {
    return null;
  }

  const showMemberHeaders = props.showMemberHeaders !== false;

  return (
    <div
      aria-label={showMemberHeaders ? "Shared team tasks" : "Tasks"}
      className="space-y-4 px-4 pb-3"
    >
      {lists.map((member) => (
        <section key={member.id} className="space-y-2">
          {showMemberHeaders ? (
            <p className="flex justify-between gap-2 text-xs font-semibold text-zinc-400">
              <span>{member.name}</span>
              <span className="font-light text-zinc-500">
                {
                  member.todos.filter((todo) => todo.status === "completed")
                    .length
                }
                /{member.todos.length}
              </span>
            </p>
          ) : null}
          <ul className="space-y-1.5">
            {member.todos.map((todo) => (
              <li
                key={todo.id}
                className="flex items-start gap-2 text-xs font-light text-zinc-400"
              >
                <span
                  className={`mt-0.5 grid size-3 shrink-0 place-items-center rounded-full ${todo.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : todo.status === "in_progress" ? "border border-sky-400 bg-sky-400/20" : "border border-zinc-600"}`}
                  aria-label={todo.status.replace("_", " ")}
                >
                  {todo.status === "completed" && (
                    <CheckIcon className="size-2.5" />
                  )}
                </span>
                <span
                  className={
                    todo.status === "cancelled" ? "line-through opacity-50" : ""
                  }
                >
                  {todo.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default TeamTodos;
