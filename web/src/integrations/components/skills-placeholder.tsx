import { SparklesIcon } from "@heroicons/react/24/outline";
import EmptyState from "../../components/empty-state/empty-state.tsx";

function SkillsPlaceholder() {
  return (
    <div className="py-16">
      <EmptyState
        actionLabel="Add skill"
        description="Skills are on the way. Check back soon."
        disabled
        framedIcon={false}
        icon={
          <SparklesIcon aria-hidden="true" className="size-10 text-zinc-500" />
        }
        title="Coming soon"
      />
    </div>
  );
}

export default SkillsPlaceholder;
