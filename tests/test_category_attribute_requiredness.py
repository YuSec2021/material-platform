import unittest

from fastapi import HTTPException

from backend.app.main import validate_category_attribute_requiredness


class CategoryAttributeRequirednessTest(unittest.TestCase):
    def test_required_attribute_cannot_allow_empty_values(self):
        with self.assertRaises(HTTPException) as raised:
            validate_category_attribute_requiredness(required=True, allow_empty=True)

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("cannot allow empty", raised.exception.detail)

    def test_optional_attribute_may_choose_whether_to_allow_empty_values(self):
        validate_category_attribute_requiredness(required=False, allow_empty=True)
        validate_category_attribute_requiredness(required=False, allow_empty=False)
        validate_category_attribute_requiredness(required=True, allow_empty=False)


if __name__ == "__main__":
    unittest.main()
