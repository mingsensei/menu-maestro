import { useEffect, useState } from "react";
import { api, ApiError, type KnowledgeDocument } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Loader2, RotateCcw, Save } from "lucide-react";

export function AdminKnowledge() {
  const [document, setDocument] = useState<KnowledgeDocument | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const { toast } = useToast();
  const dirty = document !== null && content !== document.content;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await api.knowledge();
      setDocument(next);
      setContent(next.content);
      setConflict(false);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Không tải được kho kiến thức.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    if (!document) return;
    setSaving(true);
    setError("");
    try {
      const next = await api.saveKnowledge({
        content,
        version: document.version,
      });
      setDocument(next);
      setContent(next.content);
      toast({
        title: "Đã cập nhật kho kiến thức",
        description: "Trợ lý sẽ sử dụng nội dung mới từ câu hỏi tiếp theo.",
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Không lưu được. Hãy thử lại.",
      );
      setConflict(error instanceof ApiError && error.status === 409);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <BookOpen className="h-5 w-5" />
          Kho kiến thức AI nhà hàng
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Thêm thông tin đã xác nhận về địa chỉ, giờ mở cửa, các không gian, đặt
          bàn và tiện ích. Dùng tiêu đề <code>##</code> để chia chủ đề. Có thể
          viết tiếng Việt; trợ lý trả lời theo ngôn ngữ khách chọn.
        </p>
      </div>
      <div className="rounded-2xl border bg-muted/40 p-4 text-sm leading-6">
        Nội dung lưu tại đây được dùng để trả lời khách. Chỉ thêm thông tin công
        khai; cập nhật hoặc xoá các đoạn cũ khi chính sách thay đổi. Không thêm
        mật khẩu, mã API hay thông tin cá nhân của khách.
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm"
        >
          <p>{error}</p>
          {(conflict || !document) && (
            <Button
              type="button"
              className="mt-3"
              variant="outline"
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(
                    "Tải lại sẽ thay thế nội dung đang sửa. Tiếp tục?",
                  )
                )
                  void load();
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Tải lại bản mới nhất
            </Button>
          )}
        </div>
      )}
      {loading ? (
        <p role="status" className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải kiến thức…
        </p>
      ) : (
        document && (
          <>
            <label
              htmlFor="restaurant-knowledge"
              className="block text-sm font-medium"
            >
              Nội dung nhà hàng
            </label>
            <Textarea
              id="restaurant-knowledge"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={24000}
              disabled={saving}
              className="min-h-[420px] rounded-2xl text-base leading-7"
            />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">
                {content.length.toLocaleString("vi-VN")} / 24.000 ký tự ·{" "}
                {dirty ? "Có thay đổi chưa lưu" : "Đã đồng bộ"}
              </span>
              <Button
                type="button"
                disabled={!dirty || saving || !content.trim() || conflict}
                onClick={() => void save()}
                className="rounded-xl"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Lưu kiến thức
              </Button>
            </div>
          </>
        )
      )}
    </section>
  );
}
