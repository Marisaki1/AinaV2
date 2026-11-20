import copy
import uuid
from django.test import TestCase
from django.contrib.auth.models import User
from .models import World, Resource
from .services import save_resource, Conflict
from .notebooks import act

class NotebookBoardWorkflowTests(TestCase):
    def setUp(self):
        self.user=User.objects.create_user('board-workflow-owner')
        self.world=World.objects.create(owner=self.user,name='Boards')
        self.note=save_resource(self.world,{'title':'Original source','kind':'note'})
        self.book=act(self.world,{'action':'book','title':'Investigation','sections':[]})['entry']
        self.board={'cards':[{'id':str(uuid.uuid4()),'entry_id':str(self.note.id),'x':30,'y':30,'caption':'Clue','color':'#f5e9b9'}], 'edges':[],
                    'shapes':[{'id':str(uuid.uuid4()),'type':'ellipse','x':300,'y':200,'width':150,'height':100,'text':'Suspect','color':'#315c45'}],
                    'strokes':[{'id':str(uuid.uuid4()),'color':'#315c45','points':[[10,10],[20,30],[40,40]]}]}

    def preview(self, board):
        return act(self.world,{'action':'board_preview','book_id':self.book['id'],'world_id':str(self.world.id),'board':board})

    def test_preview_does_not_save_and_board_keeps_original_ids(self):
        self.assertEqual(self.preview(self.board)['board'],self.board)
        book=Resource.objects.get(id=self.book['id']);self.assertEqual(book.revision,1)
        saved=act(self.world,{'action':'board','book_id':self.book['id'],'expected_revision':1,'board':self.board})['entry']
        self.assertEqual(saved['data']['note_board'],self.board)
        self.assertEqual(Resource.objects.get(id=self.note.id).title,'Original source')
        book.refresh_from_db();self.assertEqual(book.revisions.first().snapshot['data']['note_board'],self.board)

    def test_import_rejects_wrong_world_and_invalid_drawings(self):
        with self.assertRaises(ValueError):act(self.world,{'action':'board_preview','book_id':self.book['id'],'world_id':str(uuid.uuid4()),'board':self.board})
        for mutation in ('coordinate','color','points','type'):
            board=copy.deepcopy(self.board)
            if mutation=='coordinate':board['shapes'][0]['x']=float('inf')
            elif mutation=='color':board['strokes'][0]['color']='url(javascript:bad)'
            elif mutation=='points':board['strokes'][0]['points']=[[0,-1],[0,10]]
            else:board['shapes'][0]['type']='script'
            with self.assertRaises(ValueError):self.preview(board)

    def test_import_rejects_foreign_sources(self):
        world=World.objects.create(owner=self.user,name='Other world')
        note=save_resource(world,{'title':'Other original','kind':'note'})
        board=copy.deepcopy(self.board);board['cards'][0]['entry_id']=str(note.id)
        with self.assertRaises(ValueError):self.preview(board)

    def test_legacy_board_and_stale_save(self):
        legacy={'cards':self.board['cards'],'edges':[]}
        self.preview(legacy)
        act(self.world,{'action':'board','book_id':self.book['id'],'expected_revision':1,'board':legacy})
        with self.assertRaises(Conflict):act(self.world,{'action':'board','book_id':self.book['id'],'expected_revision':1,'board':self.board})
        self.assertEqual(Resource.objects.get(id=self.book['id']).data['note_board'],legacy)

    def test_task_to_article_retains_original_and_reuses_link(self):
        task=save_resource(self.world,{'title':'Investigate the shrine','kind':'task','tags':['clue'], 'data':{'progress':'active','priority':'high'},'document':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'Keep these original notes.'}]}]}})
        result=act(self.world,{'action':'task_article','id':str(task.id),'expected_revision':1})
        task.refresh_from_db();article=Resource.objects.get(id=result['entry']['id'])
        self.assertEqual(article.document,task.document);self.assertEqual(article.visibility,'private')
        self.assertEqual(task.data['progress'],'active');self.assertEqual(task.data['priority'],'high')
        self.assertEqual(task.data['link_id'],str(article.id))
        repeated=act(self.world,{'action':'task_article','id':str(task.id),'expected_revision':task.revision})
        self.assertEqual(repeated['entry']['id'],str(article.id));self.assertTrue(repeated['reused'])
        with self.assertRaises(Conflict):act(self.world,{'action':'task_article','id':str(task.id),'expected_revision':1})

    def test_non_task_cannot_create_task_article(self):
        with self.assertRaises(ValueError):act(self.world,{'action':'task_article','id':str(self.note.id),'expected_revision':1})

    def test_world_archive_keeps_drawings_and_remaps_source_links(self):
        from .services import world_archive, import_world_archive
        act(self.world,{'action':'board','book_id':self.book['id'],'expected_revision':1,'board':self.board})
        restored=import_world_archive(self.user,world_archive(self.world))
        book=Resource.objects.get(world=restored,title='Investigation')
        note=Resource.objects.get(world=restored,title='Original source')
        self.assertEqual(book.data['note_board']['cards'][0]['entry_id'],str(note.id))
        self.assertNotEqual(note.id,self.note.id)
        self.assertEqual(book.data['note_board']['shapes'],self.board['shapes'])
        self.assertEqual(book.data['note_board']['strokes'],self.board['strokes'])
