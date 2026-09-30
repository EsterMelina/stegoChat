"use client";
import { useEffect, useRef } from "react";
import Icon from "./Icon";

export default function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="modal-heading"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" aria-label="Fechar janela" onClick={onClose}><Icon name="close"/></button></div>
    {children}
  </dialog>;
}
