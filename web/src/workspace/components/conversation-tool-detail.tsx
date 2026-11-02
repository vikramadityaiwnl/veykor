import { useState } from "react";
import type { ChatToolCall } from "@veykor/shared";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Button } from "@astryxdesign/core/Button";
import { toolCallPresentation } from "../tool-call-presentation";

interface Props {
  tool: ChatToolCall;
}

export function ConversationToolDetail(props: Props) {
  const [limit, setLimit] = useState(24000);
  const presentation = toolCallPresentation(
    props.tool.target,
    props.tool.result,
  );

  return (
    <VStack gap={3} className="min-w-0 pb-3">
      {presentation.description ? (
        <Text type="supporting">{presentation.description}</Text>
      ) : null}
      {presentation.primary ? (
        <CodeBlock
          title={presentation.title}
          code={presentation.primary}
          language={presentation.title === "Command" ? "bash" : "plaintext"}
          hasLanguageLabel={false}
          size="sm"
          width="100%"
          maxHeight="calc(var(--spacing-12) * 3)"
          isWrapped
        />
      ) : null}
      {presentation.output ? (
        <CodeBlock
          title="Result"
          code={presentation.output.slice(0, limit)}
          size="sm"
          width="100%"
          maxHeight="calc(var(--spacing-12) * 6)"
          isWrapped
        />
      ) : (
        <Text type="supporting">
          {props.tool.status === "running" || props.tool.status === "pending"
            ? "Waiting for result…"
            : "Finished with no output."}
        </Text>
      )}
      {presentation.output.length > limit ? (
        <Button
          label="Show more output"
          size="sm"
          variant="ghost"
          clickAction={() => setLimit((value) => value + 24000)}
        />
      ) : null}
      {presentation.exitCode ? (
        <Text type="supporting">{presentation.exitCode}</Text>
      ) : null}
      {props.tool.errorMessage ? (
        <Text type="supporting">{props.tool.errorMessage}</Text>
      ) : null}
      {presentation.extra ? (
        <Collapsible
          trigger={<Text type="supporting">Other parameters</Text>}
          defaultIsOpen={false}
        >
          <CodeBlock
            code={presentation.extra}
            language="json"
            hasLanguageLabel={false}
            size="sm"
            width="100%"
            maxHeight="calc(var(--spacing-12) * 3)"
            isWrapped
          />
        </Collapsible>
      ) : null}
    </VStack>
  );
}
