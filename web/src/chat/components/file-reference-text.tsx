import { useState } from "react";
import type { ReactNode } from "react";
import {
  browserPreviewKind,
  chatPaths,
  fileNameFromPath,
} from "@veykor/shared";
import AlertDialog from "../../components/alert-dialog/alert-dialog.tsx";

interface Props {
  chatId: string;
  filePaths: Array<string>;
  itemId: string;
  text: string;
}

interface TextLink {
  end: number;
  fileIndex?: number;
  filePath?: string;
  start: number;
  url?: string;
}

function FileReferenceText(props: Props) {
  const [unsupportedExtension, setUnsupportedExtension] = useState("");

  const links: Array<TextLink> = [];

  for (const [fileIndex, filePath] of props.filePaths.entries()) {
    let start = props.text.indexOf(filePath);

    while (start >= 0) {
      links.push({
        end: start + filePath.length,
        fileIndex,
        filePath,
        start,
      });
      start = props.text.indexOf(filePath, start + filePath.length);
    }
  }

  for (const match of props.text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const matchedUrl = match[0];
    const url = matchedUrl.replace(/[),.;!?]+$/, "");

    if (url !== "" && match.index !== undefined) {
      links.push({
        end: match.index + url.length,
        start: match.index,
        url,
      });
    }
  }

  links.sort(
    (first, second) => first.start - second.start || second.end - first.end,
  );

  const rendered: Array<ReactNode> = [];
  let cursor = 0;

  for (const link of links) {
    if (link.start < cursor) {
      continue;
    }

    if (link.start > cursor) {
      rendered.push(props.text.slice(cursor, link.start));
    }

    if (link.url !== undefined) {
      rendered.push(
        <a
          className="text-sky-400 underline"
          href={link.url}
          key={`url-${link.start}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {link.url}
        </a>,
      );
    } else if (link.filePath !== undefined && link.fileIndex !== undefined) {
      const fileName = fileNameFromPath(link.filePath);
      const previewKind = browserPreviewKind(link.filePath);

      if (previewKind !== null && props.chatId !== "") {
        rendered.push(
          <a
            className="text-sky-400 underline"
            href={chatPaths.file(props.chatId, props.itemId, link.fileIndex)}
            key={`file-${link.start}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {fileName}
          </a>,
        );
      } else {
        rendered.push(
          <button
            className="text-sky-400 underline"
            key={`file-${link.start}`}
            onClick={() => {
              const extension = fileName.split(".").at(-1) ?? "";
              setUnsupportedExtension(extension);
            }}
            type="button"
          >
            {fileName}
          </button>,
        );
      }
    }

    cursor = link.end;
  }

  if (cursor < props.text.length) {
    rendered.push(props.text.slice(cursor));
  }

  const extension = unsupportedExtension.toLowerCase();

  return (
    <>
      {rendered}

      {unsupportedExtension !== "" && (
        <AlertDialog
          confirmLabel="Got it"
          danger={false}
          description={`Previewing .${extension} files from chat is not supported yet. Open the Work view to inspect this file.`}
          onClose={() => setUnsupportedExtension("")}
          onConfirm={() => setUnsupportedExtension("")}
          title="Preview in Work"
        />
      )}
    </>
  );
}

export default FileReferenceText;
