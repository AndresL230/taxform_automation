import { useRef, useState } from 'react'

export default function UploadZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const emit = (list: FileList | null) => {
    if (list && list.length) onFiles(Array.from(list))
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); emit(e.dataTransfer.files) }}
      className={`rounded-[3px] border-2 border-dashed bg-paper-2 p-10 text-center ${dragOver ? 'border-accent' : 'border-[#d7d4cc]'}`}
    >
      <div className="text-2xl">⬆</div>
      <div className="mt-2 text-base font-semibold text-ink">Drag &amp; drop tax documents</div>
      <div className="text-sm text-muted">PDF, PNG or JPG · multiple files · or click to browse</div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-4 rounded-[3px] bg-accent px-4 py-2 text-sm font-semibold text-white"
      >
        Browse files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => emit(e.target.files)}
      />
    </div>
  )
}
