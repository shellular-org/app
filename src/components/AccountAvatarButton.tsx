import clsx from "clsx";
import { useAuth } from "lib/auth";
import { getInitials } from "lib/utils";

interface Props {
	className?: string;
	onClick: () => void;
}

export default function AccountAvatarButton({ className, onClick }: Props) {
	const { user } = useAuth();
	if (!user) return null;

	return (
		<button
			type="button"
			className={clsx(
				"account-avatar-button haptic-trigger grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-card-border bg-surface-strong text-accent transition-transform duration-150 active:scale-95",
				className,
			)}
			onClick={onClick}
			aria-label="Account"
			title="Account"
		>
			{user.avatarUrl ? (
				<img
					src={user.avatarUrl}
					alt=""
					className="h-full w-full object-cover"
				/>
			) : (
				<span className="text-[13px] font-bold leading-none uppercase tracking-tight">
					{getInitials(user.name || user.email)}
				</span>
			)}
		</button>
	);
}
