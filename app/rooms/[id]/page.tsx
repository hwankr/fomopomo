import RoomView from '@/components/RoomView';

export default function RoomPage({ params }: { params: { id: string } }) {
    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white font-sans">
            <RoomView roomId={params.id} />
        </div>
    );
}
