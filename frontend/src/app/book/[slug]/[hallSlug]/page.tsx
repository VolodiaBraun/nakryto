import BookingPageClient from '../BookingPageClient';

export default function HallBookingPage({ params }: { params: { slug: string; hallSlug: string } }) {
  return <BookingPageClient slug={params.slug} hallSlug={params.hallSlug} />;
}
