import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
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


class PublicationTests(unittest.TestCase):
    def setUp(self):
        import tempfile, json
        from unittest.mock import patch
        import import_sheet
        self.module = import_sheet
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'game'
        self.output = Path(self.temp.name) / 'stage'
        (self.root / 'data').mkdir(parents=True)
        self.patcher = patch.object(import_sheet, 'ROOT', self.root)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.old = {'schema': 1, 'creatures': [{'id': 'cr-first01', 'image': {'src': 'assets/creatures/cr-first01.11111111.webp'}, 'trainer': {'portrait': 'assets/portraits/cr-first01.11111111.webp'}}]}
        self.new = {'id': 'cr-first01', 'image': {'src': 'assets/creatures/cr-first01.22222222.webp'}, 'trainer': {'portrait': 'assets/portraits/cr-first01.22222222.webp'}}
        self.roster = self.root / 'data/creatures-v2.json'
        self.roster.write_text(json.dumps(self.old))
        for relative in [self.old['creatures'][0]['image']['src'], self.old['creatures'][0]['trainer']['portrait']]:
            p = self.root / relative
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'old')
        for relative in [self.new['image']['src'], self.new['trainer']['portrait']]:
            p = self.output / relative
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'new')

    def test_invalid_combined_roster_does_not_copy_assets(self):
        import subprocess
        from unittest.mock import patch
        before = self.roster.read_bytes()
        with patch.object(self.module.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'node')):
            with self.assertRaises(subprocess.CalledProcessError): self.module.publish([self.new], self.output)
        self.assertEqual(before, self.roster.read_bytes())
        self.assertFalse((self.root / self.new['image']['src']).exists())
        self.assertFalse((self.root / self.new['trainer']['portrait']).exists())

    def test_copy_failure_rolls_back_assets_and_roster(self):
        from unittest.mock import patch
        import shutil
        original = shutil.copyfile
        before = self.roster.read_bytes()
        calls = []
        def copy(src, dst):
            calls.append(dst)
            if len(calls) == 2: raise OSError('disk full')
            return original(src, dst)
        with patch.object(self.module.subprocess, 'run'), patch('shutil.copyfile', side_effect=copy):
            with self.assertRaises(OSError): self.module.publish([self.new], self.output)
        self.assertEqual(before, self.roster.read_bytes())
        self.assertTrue(all(not p.exists() for p in calls))

    def test_reimport_removes_stale_assets_but_keeps_legacy_references(self):
        from unittest.mock import patch
        import json
        (self.root / 'data/creatures.json').write_text(json.dumps({'schema':1,'creatures':[{'image':self.old['creatures'][0]['image'],'trainer':{'portrait':self.new['trainer']['portrait']}}]}))
        with patch.object(self.module.subprocess, 'run'): self.module.publish([self.new], self.output)
        self.assertTrue((self.root / self.old['creatures'][0]['image']['src']).exists())
        self.assertFalse((self.root / self.old['creatures'][0]['trainer']['portrait']).exists())
        self.assertTrue((self.root / self.new['image']['src']).exists())
        self.assertEqual(json.loads(self.roster.read_text())['creatures'], [self.new])


class ExtractionArgumentsTests(unittest.TestCase):
    def test_creature_paper_polygons_reach_the_cropper(self):
        import import_sheet, tempfile, json, sys, types
        from unittest.mock import patch, MagicMock
        # Exercise build argument plumbing without OpenCV/Pillow installations.
        art = MagicMock(width=100, height=100)
        art.copy.return_value = art
        image = MagicMock()
        image.open.return_value = image
        image.convert.return_value = image
        image.rotate.return_value = image
        image.new.return_value = image
        imageops = MagicMock()
        imageops.exif_transpose.return_value = image
        pil = types.ModuleType('PIL')
        pil.Image, pil.ImageOps, pil.ImageDraw = image, imageops, MagicMock()
        polygons = [[[0.1, 0.2], [0.4, 0.2], [0.4, 0.5]]]
        manifest = {'capture':'scan', 'added':'2026-10-07','trainers':[{'id':'tr-test01','nickname':'Test','assetId':'cr-test01','portraitRotation':270,'portraitSource':'photo.jpg','portraitCrop':[0,0,1,1]}],
                    'creatures':[{'id':'cr-test01','name':'Test','trainerId':'tr-test01','reviewed':True,'facing':'front','rotation':90,'source':'photo.jpg','creatureCrop':[0,0,1,1], 'keepPaper':polygons,
                                  'stats':{'health':3,'attack':3,'defense':2,'speed':2}, 'typeMarks':[{'id':'water','status':'selected'}],
                                  'moveMarks':[{'id':id,'status':'selected'} for id in ['steady','blast','heal']]}]}
        with tempfile.TemporaryDirectory() as temporary, patch.dict(sys.modules, {'PIL':pil}), patch.object(import_sheet,'crop_art',return_value=art) as crop, patch.object(import_sheet,'write_asset',return_value='assets/test.webp'), patch.object(import_sheet.subprocess,'run'):
            import_sheet.build(manifest,Path(temporary),Path(temporary))
        self.assertEqual(crop.call_args_list[1].args[3], polygons)
        self.assertTrue(all(c.kwargs['scan'] for c in crop.call_args_list))
        from unittest.mock import call
        self.assertEqual(image.rotate.call_args_list, [call(270, expand=True), call(90, expand=True)])

class ScanExtractionTests(unittest.TestCase):
    def setUp(self):
        import importlib.util
        if not all(importlib.util.find_spec(name) for name in ('cv2', 'PIL', 'numpy')):
            self.skipTest('Optional photo dependencies are not installed')

    def test_even_gray_scan_fill_stays_opaque_and_original_color(self):
        from PIL import Image, ImageDraw
        from import_sheet import crop_art
        photo = Image.new('RGB', (1000, 1000), 'white')
        ImageDraw.Draw(photo).rectangle((200, 200, 800, 800), fill=(180, 180, 180))
        cutout = crop_art(photo, [0, 0, 1, 1], scan=True)
        center = cutout.getpixel((cutout.width // 2, cutout.height // 2))
        self.assertEqual(center, (180, 180, 180, 255))

    def test_reviewed_template_mask_preserves_overlapping_marker(self):
        from PIL import Image, ImageDraw
        from import_sheet import crop_art
        photo = Image.new('RGB', (1000, 1000), 'white')
        draw = ImageDraw.Draw(photo)
        draw.rectangle((10, 200, 90, 800), fill='black')
        draw.rectangle((300, 200, 700, 800), fill=(0, 170, 230))
        cutout = crop_art(photo, [0, 0, 1, 1], scan=True, exclude_dark_print=[[0, 0, 1, 1]])
        self.assertLess(cutout.width, 400)
        self.assertEqual(cutout.getpixel((cutout.width // 2, cutout.height // 2)), (0, 170, 230, 255))

if __name__ == '__main__': unittest.main()
