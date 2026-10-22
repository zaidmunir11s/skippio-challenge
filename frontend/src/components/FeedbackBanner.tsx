type Props = {
  feedback: { kind: "success" | "error" | "info"; message: string } | null;
};

export function FeedbackBanner({ feedback }: Props) {
  if (!feedback) {
    return <div className="feedback-slot" aria-live="polite" />;
  }

  return (
    <div className="feedback-slot" aria-live="polite">
      <div
        className={`banner banner--${feedback.kind}`}
        role={feedback.kind === "error" ? "alert" : "status"}
      >
        <span className="banner__label">
          {feedback.kind === "error"
            ? "Error"
            : feedback.kind === "success"
              ? "Update"
              : "Note"}
        </span>
        <span className="banner__message">{feedback.message}</span>
      </div>
    </div>
  );
}
