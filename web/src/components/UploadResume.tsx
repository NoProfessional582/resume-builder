import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { Button, ErrorText } from './ui';

/** Picks a .docx (button or drag and drop) and starts an import. */
export function UploadResume({ label = 'Upload resume (.docx)' }: { label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const upload = useMutation({
    mutationFn: api.uploadResume,
    onSuccess: ({ id }) => navigate(`/template/import/${id}`),
  });

  const pick = (file: File | undefined) => {
    if (file) upload.mutate(file);
  };

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
        dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-white'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <Button variant="primary" onClick={() => input.current?.click()} disabled={upload.isPending}>
        {upload.isPending ? 'Uploading…' : label}
      </Button>
      <p className="mt-2 text-xs text-slate-500">or drop the file here. Word (.docx) only.</p>
      {upload.error && <div className="mt-3 text-left"><ErrorText>{upload.error.message}</ErrorText></div>}
    </div>
  );
}
