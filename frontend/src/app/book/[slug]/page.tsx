import BookingPageClient from './BookingPageClient';

export default function BookPage({ params }: { params: { slug: string } }) {
  return <BookingPageClient slug={params.slug} />;
}
