import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { WorkProject } from "@veykor/shared";
import SegmentedControl from "../../components/segmented-control/segmented-control.tsx";
import Selector from "../../components/selector/selector.tsx";

interface Props {
  projectFilter: string;
  projects: Array<WorkProject>;
  query: string;
  scopeFilter: "" | "global" | "project";
  onProjectChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onScopeChange: (value: "" | "global" | "project") => void;
}

function MemoryFilters(props: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="w-full sm:w-72">
        <SegmentedControl
          label="Memory scope filter"
          onChange={props.onScopeChange}
          options={[
            { label: "All", value: "" },
            { label: "Global", value: "global" },
            { label: "Project", value: "project" },
          ]}
          size="sm"
          value={props.scopeFilter}
        />
      </div>

      <div className="hidden flex-1 sm:block" />

      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
        {props.scopeFilter === "project" && (
          <div className="w-full sm:w-56">
            <Selector
              label="Filter by project"
              onChange={props.onProjectChange}
              options={[
                { label: "All projects", value: "" },
                ...props.projects.map((project) => ({
                  label: project.name,
                  value: project.id,
                })),
              ]}
              value={props.projectFilter}
            />
          </div>
        )}

        <div className="group relative w-full sm:w-64">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500 transition group-focus-within:text-zinc-300"
          />

          <input
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm font-light text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search memories..."
            type="search"
            value={props.query}
          />
        </div>
      </div>
    </div>
  );
}

export default MemoryFilters;
