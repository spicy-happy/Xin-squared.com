import unittest
from import_sheet import active_choices

class MarkReviewTests(unittest.TestCase):
    def test_canceled_circles_never_win(self):
        self.assertEqual(active_choices([{'id':'water','status':'canceled'}, {'id':'ground','status':'selected'}], 'Type', 1), ['ground'])
        marks = [{'id':'heavy','status':'canceled'}, {'id':'blast','status':'selected'}, {'id':'guard','status':'selected'}, {'id':'heal','status':'canceled'}, {'id':'toughen','status':'selected'}]
        self.assertEqual(active_choices(marks, 'Moves', 3), ['blast','guard','toughen'])

    def test_ambiguous_mark_requires_review_even_with_valid_active_choices(self):
        with self.assertRaisesRegex(ValueError, 'ambiguous'):
            active_choices([{'id':'water','status':'ambiguous'}, {'id':'ground','status':'selected'}], 'Type', 1)

    def test_missing_duplicate_or_extra_active_choices_are_rejected(self):
        for marks in [[], [{'id':'water','status':'selected'}, {'id':'ground','status':'selected'}], [{'id':'water','status':'selected'}, {'id':'water','status':'selected'}]]:
            with self.assertRaises(ValueError): active_choices(marks, 'Type', 1)

if __name__ == '__main__': unittest.main()
